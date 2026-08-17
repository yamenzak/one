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
import { PLATFORM_ROLES, areasOn, eventsOf, primaryOf, type Channel } from "@engine/kernel";
import {
  FlagConsole, Guide, NotificationPolicy, Settings, Shelf, Shell, settingsShown, policyShown,
} from "@engine/design";
import { HELLO } from "../src/index.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

/** Everything a founder holds: the platform's `owner` office ∪ the app's
    founding role (D15) — resolved exactly as `permissionsFor` would. */
const OWNER = new Set([...(PLATFORM_ROLES.owner ?? []), ...(HELLO.access.roles.writer ?? [])]);
const EVERY: readonly Channel[] = ["inbox", "email", "push"];

describe("everything hello declares reaches a screen", () => {
  /*
    ⚠️ EVERY SETTING REACHES A PAGE SOMEBODY CAN OPEN, which is a stricter claim
    than the one this made before. Settings DESCEND now, so a level renders a
    LIST of areas and one render can no longer contain every row — and asserting
    against a single render would have quietly become an assertion that the three
    area names are present. This walks the pages the surface would offer and
    checks each row is on one of them, so a setting declared into an area the
    level never lists fails here rather than being unreachable in silence.
  */
  const reaches = (level: "tenant" | "person", held: ReadonlySet<string>) => {
    const declared = Object.values(HELLO.settings ?? {}).filter((s) => s.level === level);
    expect(declared.length).toBeGreaterThan(0);

    const pages = areasOn(HELLO.settings ?? {}, HELLO.settingAreas ?? {}, level);
    expect(pages.length).toBeGreaterThan(0);

    const drawn = pages.map((page) => html(
      <Settings
        book={HELLO.settings ?? {}} areas={HELLO.settingAreas ?? {}}
        level={level} area={page.id} onArea={() => {}}
        stored={{}} held={held} onChange={() => {}}
      />,
    )).join("\n");

    for (const s of declared) expect(drawn).toContain(s.field.label);
    return declared;
  };

  it("renders every workspace setting it declared, on a page", () => {
    const tenant = reaches("tenant", OWNER);
    expect(settingsShown(HELLO.settings ?? {}, "tenant", OWNER)).toEqual(tenant.map((s) => s.id));
  });

  it("renders every personal setting it declared, on a page", () => {
    reaches("person", new Set());
  });

  /*
    ⚠️ AND THE LIST OFFERS EVERY PAGE, which is the other half: a page reachable
    only by typing its address is a page nobody opens.
  */
  it("offers every page a level has", () => {
    for (const level of ["tenant", "person"] as const) {
      const out = html(
        <Settings
          book={HELLO.settings ?? {}} areas={HELLO.settingAreas ?? {}}
          level={level} onArea={() => {}}
          stored={{}} held={OWNER} onChange={() => {}}
        />,
      );
      for (const page of areasOn(HELLO.settings ?? {}, HELLO.settingAreas ?? {}, level)) {
        expect(out).toContain(page.label);
        expect(out).toContain(page.said);
      }
    }
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
