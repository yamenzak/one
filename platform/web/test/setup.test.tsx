/**
 * THE SETUP DOOR, HELD TO WHAT IT PROMISES.
 *
 * ⚠️ THE INTERESTING HALF OF THIS SCREEN IS TWO PURE FUNCTIONS, WHICH IS WHY
 * THEY ARE TWO PURE FUNCTIONS. That a business name becomes a legal DNS label,
 * and that a refusal lands under the field it is about rather than in a corner,
 * are the two things this screen can get wrong in a way somebody only discovers
 * while signing up — and neither is visible in markup.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Problem } from "@one/kernel";
import { slugProblem } from "@one/kernel";
import { fieldOf, SetupScreen, slugFrom, type SetupWire } from "../src/setup.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node as never);

const WIRE: SetupWire = { create: async ({ slug }) => ({ slug }) };

const screen = (over: Partial<React.ComponentProps<typeof SetupScreen>> = {}) =>
  html(<SetupScreen product="Kova" root="kova.4dl.app" wire={WIRE} onMade={() => undefined} {...over} />);

/* ------------------------------------------------------------- the address --- */

describe("what somebody typed, as an address", () => {
  /*
    ⚠️ THE NAMES PEOPLE ACTUALLY TYPE. "Haddad Strength & Co." carries a space, an
    ampersand and a full stop, and every one of them is a hostname the route
    refuses — so a screen that sent the name through unchanged would greet each
    new customer with a refusal for typing their own business name correctly.
  */
  it("turns a business name into something a hostname can be", () => {
    expect(slugFrom("Haddad Strength & Co.")).toBe("haddad-strength-co");
    expect(slugFrom("North  Clinic")).toBe("north-clinic");
    expect(slugFrom("Zürich Süd")).toBe("zurich-sud");
  });

  /*
    ⚠️ NEVER A LEADING OR TRAILING HYPHEN, which is the one shape a naive replace
    produces and the one shape a DNS label may not have — so the suggestion would
    be illegal for exactly the names that end in punctuation.
  */
  it("never suggests something the route would refuse", () => {
    for (const typed of ["  The Gym  ", "!!!Studio!!!", "a", "Café —", "My Gym…"]) {
      const out = slugFrom(typed);
      if (out.length === 0) continue;
      expect(slugProblem(out, []), `${typed} → ${out}`).not.toBe("not a valid address");
    }
  });

  /* ⚠️ AND IT IS BOUNDED, because the field is. A 300-character name truncated to
     a label that is still too long is refused by the route with a message about
     length, which is a rule the person never saw. */
  it("stays inside what the route accepts", () => {
    expect(slugFrom("x".repeat(200)).length).toBeLessThanOrEqual(32);
    /* Truncation must not leave the hyphen it cut a word at. */
    expect(slugFrom(`${"ab ".repeat(20)}`).endsWith("-")).toBe(false);
  });

  /*
    ⚠️ THE SCREEN AND THE ROUTE ASK THE SAME FUNCTION. This is the assertion that
    keeps `slugProblem` in the kernel: written twice, the field says an address is
    fine and the only opinion that counts refuses it, and the way that reaches
    somebody is a spinner followed by a message about a thing they cannot see.
  */
  it("checks the address with the server's own rule, reserved labels included", () => {
    expect(slugProblem("admin", [])).toBe("that address is taken");
    expect(slugProblem("my-gym", [])).toBeNull();
  });
});

/* ---------------------------------------------------------------- refusals --- */

describe("where a refusal goes", () => {
  const problem = (code: string, field?: string): Problem =>
    ({ code, status: 400, retryable: false, ref: "req_1", title: "No", ...(field ? { meta: { field } } : {}) }) as unknown as Problem;

  /*
    ⚠️ A TAKEN ADDRESS BELONGS UNDER THE ADDRESS FIELD. The value that was refused
    is on the screen; a message about it in a corner is read after somebody has
    already retyped the thing that was wrong.
  */
  it("puts a refusal about the address under the address", () => {
    expect(fieldOf(problem("platform.conflict", "slug"))).toBe("slug");
    expect(fieldOf(problem("platform.invalid", "slug"))).toBe("slug");
  });

  /*
    ⚠️ AND NOT BEING LET IN IS NOT A FIELD ERROR. Nothing somebody retypes fixes
    it, so putting it under the address would be an instruction to keep trying —
    which is the shape of a form that never says what is actually wrong.
  */
  it("does not put being un-provisioned under a field", () => {
    expect(fieldOf(problem("platform.not_provisioned"))).toBeNull();
    expect(fieldOf(problem("platform.invalid", "region"))).toBeNull();
  });
});

/* ------------------------------------------------------------------ screen --- */

describe("the screen", () => {
  /*
    ⚠️ THE WHOLE HOSTNAME IS ON THE SCREEN. An address field showing `my-gym` with
    the rest of it in a help page reads as a nickname, and somebody picks one they
    would not have chosen if they had seen it written out. It is permanent.
  */
  it("shows the address that will exist, under the field", () => {
    expect(screen()).toContain("your-address.kova.4dl.app");
  });

  it("says which half is permanent", () => {
    expect(screen()).toContain("The address cannot.");
  });

  /*
    ⚠️ NO REGION PICKER WHERE THERE IS NOTHING TO PICK. A deployment with one
    region asking which one is a question with a single answer, and it arrives at
    the moment somebody is trying to start.
  */
  it("asks where it is kept only when there is more than one answer", () => {
    expect(screen()).not.toContain("Where its records are kept");
    expect(screen({ places: [{ id: "eu", label: "Europe" }] })).not.toContain("Where its records are kept");
    expect(screen({ places: [{ id: "eu", label: "Europe" }, { id: "us", label: "United States" }] }))
      .toContain("Where its records are kept");
  });

  /*
    ⚠️ AND IT IS ABOVE THE BUTTON, WHICH IS THE HALF THAT WAS WRONG. Where a
    workspace's records are kept cannot be changed afterwards, and the row sat
    under the control that commits it — so the ordinary path was to press Create
    having never scrolled past the one decision on this screen that is as
    permanent as the address.
  */
  it("asks where it is kept before the button that commits it", () => {
    const out = screen({ places: [{ id: "eu", label: "Europe" }, { id: "us", label: "United States" }] });
    expect(out.indexOf("Where its records are kept")).toBeLessThan(out.indexOf("Create workspace"));
  });

  /*
    ⚠️ THE ADDRESS IT WILL BE AT SITS INSIDE THE FIELD'S OWN SPACING. As the
    form's next child it was exactly as far from the field above as from the
    button below, so a line about the address read as a line about pressing
    Create. The markup is the assertion: it is inside `.field`.
  */
  it("puts the whole hostname under the field it is about", () => {
    expect(screen()).toMatch(/<div class="field">(?:(?!<\/div><div class="field">).)*your-address\.kova\.4dl\.app/s);
  });

  /*
    ⚠️ AND NO PLAN STEP, WHICH IS A FACT ABOUT ORIGINS RATHER THAN TASTE.
    `billing.choose` resolves its workspace from the host, and this host has none
    — so a plan picked here could not be recorded anywhere. The product asks on
    its own address, where the answer lands.
  */
  it("does not ask for a plan on a door with no workspace behind it", () => {
    const out = screen();
    expect(out).not.toMatch(/plan/i);
    expect(out).not.toMatch(/\$|per month/i);
  });
});
