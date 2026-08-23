/**
 * THE REFERENCE APP'S OWN DECLARATIONS, THROUGH THE REAL SCREENS.
 *
 * ⚠️ THIS IS THE AUTODISCOVERY RULE, ASSERTED IN BOTH DIRECTIONS, AGAINST A REAL
 * MANIFEST. Declared → surfaced: everything `ground` declares appears somewhere a
 * person could change it, and `ground/src/index.ts` contains no screen. Surfaced
 * → declared: the screens render nothing that is not in the manifest, so a
 * control a person can press is always a control something reads.
 *
 * ⚠️ AND IT IS THE REFERENCE APP ON PURPOSE. The next app is copied from this
 * one, so a declaration kind that never reaches a surface here is one that will
 * never reach a surface anywhere.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_ENTITLEMENTS, PLATFORM_ROLES, areasOn, eventsOf, primaryOf,
  type Channel, type PlanSpec,
} from "@engine/kernel";
import {
  Guide, NotificationPolicy, Settings, Shelf, Shell, settingsShown, policyShown,
} from "@engine/design";
import { GROUND } from "../src/index.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

/**
 * ⚠️ AND THE SAME SCREEN, WAITED FOR, WHERE A LAZY CHUNK IS INSIDE IT. The
 * expensive components — a calendar, a colour picker, a table — arrive in a
 * chunk of their own so their weight stays out of the entry
 * (`scripts/weight.test.mjs`), and `renderToStaticMarkup` answers a suspended
 * boundary with its fallback rather than starting the import. So a screen with
 * a table on it renders as a skeleton here, confidently, and every `toContain`
 * fails on something that is right. `react-dom/static` waits for the boundary.
 */
const drawn = async (node: React.ReactNode): Promise<string> => {
  const { prelude } = await prerender(node);
  return new Response(prelude as unknown as ReadableStream).text();
};

/** Everything a founder holds: the platform's `owner` office ∪ the app's
    founding role (D15) — resolved exactly as `permissionsFor` would. */
const OWNER = new Set([...(PLATFORM_ROLES.owner ?? []), ...(GROUND.access.roles.writer ?? [])]);
const EVERY: readonly Channel[] = ["inbox", "email", "push"];

describe("everything ground declares reaches a screen", () => {
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
    const declared = Object.values(GROUND.settings ?? {}).filter((s) => s.level === level);
    expect(declared.length).toBeGreaterThan(0);

    const pages = areasOn(GROUND.settings ?? {}, GROUND.settingAreas ?? {}, level);
    expect(pages.length).toBeGreaterThan(0);

    const drawn = pages.map((page) => html(
      <Settings
        book={GROUND.settings ?? {}} areas={GROUND.settingAreas ?? {}}
        level={level} area={page.id} onArea={() => {}}
        stored={{}} held={held} onChange={() => {}}
      />,
    )).join("\n");

    for (const s of declared) expect(drawn).toContain(s.field.label);
    return declared;
  };

  it("renders every workspace setting it declared, on a page", () => {
    const tenant = reaches("tenant", OWNER);
    expect(settingsShown(GROUND.settings ?? {}, "tenant", OWNER)).toEqual(tenant.map((s) => s.id));
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
          book={GROUND.settings ?? {}} areas={GROUND.settingAreas ?? {}}
          level={level} onArea={() => {}}
          stored={{}} held={OWNER} onChange={() => {}}
        />,
      );
      for (const page of areasOn(GROUND.settings ?? {}, GROUND.settingAreas ?? {}, level)) {
        expect(out).toContain(page.label);
        expect(out).toContain(page.said);
      }
    }
  });

  it("renders every notification it declared, to somebody in its audience", () => {
    const types = Object.values(GROUND.notifications ?? {});
    expect(types.length).toBeGreaterThan(0);
    expect(policyShown(GROUND.notifications ?? {}, OWNER, EVERY).map((o) => o.id))
      .toEqual(types.map((t) => t.id));

    const out = html(
      <NotificationPolicy
        book={GROUND.notifications ?? {}} level="tenant" policy={{}} preference={{}}
        available={EVERY} held={OWNER} onChange={() => {}}
      />,
    );
    for (const t of types) expect(out).toContain(t.label);
  });

  /* ⚠️ THE FLAGS' OWN TEST MOVED, because the component it drew is deleted —
     two screens draw flags now and both are in the space rather than in the
     shared package. "Every declared flag reaches a surface" is asserted where
     the surface is: `operator.test.ts` reads `op.flags` and checks the book
     travels whole, label and reason included. */

  /* ⚠️ THE CATALOGUE IS THE DEPLOYMENT'S, so the shelf is fed one rather than
     reading an app's — a product has no plans of its own since the membership
     became one. What it still draws is every KEY the workspace could hold. */
  it("renders every plan and every entitlement it sells", async () => {
    /* ⚠️ ITS OWN CATALOGUE, NOT THE DEPLOYMENT'S. An app importing One's plans
       would point the dependency arrow backwards — and what is under test is
       that the shelf draws a catalogue, not which one this deployment sells. */
    const plans: PlanSpec[] = [
      { id: "none", name: "No plan", said: "", kind: "personal", price: 0, currency: "USD",
        credits: 0, order: 0, parking: true, includes: {} },
      { id: "solo", name: "Solo", said: "", kind: "personal", price: 1200, currency: "USD",
        credits: 1500, order: 1, includes: {} },
    ];
    const keys = { ...PLATFORM_ENTITLEMENTS, ...GROUND.entitlements };
    const out = await drawn(
      <Shelf plans={plans} entitlements={keys} current="none" onChoose={() => {}} />,
    );
    for (const plan of plans) expect(out).toContain(plan.name);
    for (const [, def] of Object.entries(keys)) {
      if (!def.reserved) expect(out).toContain(def.label);
    }
  });

  it("renders every onboarding step it declared", () => {
    const steps = Object.values(GROUND.guide ?? {});
    expect(steps.length).toBeGreaterThan(0);
    const out = html(
      <Guide book={GROUND.guide ?? {}} raised={{ workspace: [], person: [] }}
        held={OWNER} onGo={() => {}} />,
    );
    for (const step of steps) expect(out).toContain(step.label);
  });

  /*
    ⚠️ AN EMPTY LIST IS "NOTHING DONE" AND `null` IS "NOT ASKED YET", AND THE
    CARD MUST NOT SAY THE FIRST WHILE IT MEANS THE SECOND. It did: the screen
    read `Object.keys(got?.counts ?? {})`, so before `guide.view` came back the
    checklist drew every step under a confident "0 of N done" — a claim about a
    workspace nobody had checked, on the one block of the home screen that
    appeared instantly precisely because it was not waiting for anything.

    ⚠️ AND IT DRAWS NOTHING RATHER THAN BONES, on purpose. A step that is done
    disappears, so the row count is a function of the answer — the case
    `bones.tsx` names as the one a placeholder cannot stand in for.
  */
  it("says nothing at all until it knows what has been done", () => {
    const steps = Object.values(GROUND.guide ?? {});
    const out = html(<Guide book={GROUND.guide ?? {}} raised={null} held={OWNER} onGo={() => {}} />);
    expect(out, "a checklist drawn before its answer is a count nobody checked").toBe("");
    for (const step of steps) expect(out).not.toContain(step.label);
  });

  it("draws every primary destination it declared", () => {
    const primary = primaryOf(GROUND.screens);
    const out = html(
      <Shell
        screens={GROUND.screens} here="/" held={OWNER} flags={{ "note-search": true }}
        crown={{ appId: GROUND.id, appName: GROUND.name, appMark: GROUND.mark, tenantName: "Northwind" }}
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
    const offered = policyShown(GROUND.notifications ?? {}, OWNER, EVERY);
    for (const one of offered) expect(GROUND.notifications?.[one.id]).toBeDefined();
  });

  it("offers no setting that is not declared", () => {
    for (const level of ["tenant", "person"] as const) {
      for (const id of settingsShown(GROUND.settings ?? {}, level, OWNER)) {
        expect(GROUND.settings?.[id]).toBeDefined();
      }
    }
  });

  /* ⚠️ A checklist step waits for an event this app actually raises — including
     the ones its collections raise without anybody writing them. */
  it("waits only for events this app raises", () => {
    const events = eventsOf(GROUND);
    for (const step of Object.values(GROUND.guide ?? {})) expect(events).toContain(step.done);
    for (const m of Object.values(GROUND.milestones ?? {})) expect(events).toContain(m.on);
  });

  /* ⚠️ And every notification points at a screen that exists — the dead-link
     class, which only appears once something renders the row. */
  it("links every notification at a screen that exists", () => {
    const routes = GROUND.screens.map((s) => s.route);
    for (const t of Object.values(GROUND.notifications ?? {})) expect(routes).toContain(t.link);
  });
});
