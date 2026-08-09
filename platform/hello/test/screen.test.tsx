/**
 * AN APP'S SCREEN, HELD TO THE LANGUAGE.
 *
 * ⚠️ THE PROPERTY IS THAT AN APP CANNOT PRODUCE A STATE THE RENDERER HAS NOT
 * DESIGNED. Every branch below comes from a `Collection` and a `Button` that
 * declared it — so the four states of a list and the locked state of a control
 * are the platform's, identical in every product, and reached by an app writing
 * nothing but an arrangement.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotesScreen } from "../src/screens/notes.js";

const html = (node: React.ReactNode) => renderToStaticMarkup(node as never);
const screen = (over: Partial<Parameters<typeof NotesScreen>[0]> = {}) =>
  html(<NotesScreen notes={[]} canWrite onOpen={() => undefined} onAdd={() => undefined} {...over} />);

describe("an app arranges the language and produces none of it", () => {
  /*
    ⚠️ NOT YET, NOTHING, FAILED AND READY ARE FOUR DIFFERENT SCREENS, and the app
    wrote none of them. `catch(() => setItems([]))` cannot be expressed here: an
    empty array IS a result, and the container has a separate branch for not
    having one.
  */
  it("renders four distinct states from one prop", () => {
    const states = [
      screen({ notes: null }),
      screen({ notes: [] }),
      screen({ notes: [{ id: "n1", title: "one" }], failed: true }),
      screen({ notes: [{ id: "n1", title: "one" }] }),
    ];
    expect(new Set(states).size).toBe(4);
    expect(states[0]).toContain('data-state="unknown"');
    expect(states[1]).toContain('data-state="empty"');
    expect(states[2]).toContain('data-state="error"');
    expect(states[3]).toContain('data-state="ready"');
  });

  /*
    ⚠️ LOCKED, NOT HIDDEN. Hiding what a plan withholds means the tenant never
    learns it exists; a locked control explains itself and carries the way out.
  */
  it("locks what the plan withholds rather than hiding it", () => {
    const locked = screen({ canWrite: false });
    expect(locked).toContain('data-state="locked"');
    // The apostrophe is escaped on the way out, which is the markup working.
    expect(locked).toMatch(/isn(?:&#x27;|')t in your plan/);
    expect(locked).toContain('data-resolve="billing.plans"');
    expect(screen({ canWrite: true })).toContain('data-state="idle"');
  });

  it("puts no colour and no timing on the wire", () => {
    const rendered = [screen(), screen({ notes: null }), screen({ canWrite: false })].join("");
    expect(rendered).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rendered).not.toMatch(/\b\d+m?s\b|cubic-bezier|transition:|animation:/i);
  });
});
