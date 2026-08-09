/**
 * THE SHELL, THE STYLESHEET AND THE LIVE SURFACE — the last of stage 4.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_BRAND, IDLE, live, Shell, sheetFor, STRUCTURE, themeSheet, warnsBeforeLeaving,
  dockedTitle, PRESENTATIONS, type Destination, type LiveState, type LiveSurface, type Width,
} from "../src/index.js";

const html = (node: React.ReactNode) => renderToStaticMarkup(node as never);
const destinations: readonly Destination[] = [
  { id: "home", label: "Home", icon: "home", kind: "overview" },
  { id: "notes", label: "Notes", icon: "note", kind: "collection" },
  { id: "player", label: "Player", icon: "play", kind: "task" },
];

/* ----------------------------------------------------------- stylesheet --- */

describe("the stylesheet asks the right box", () => {
  /*
    ⚠️ INSIDE A PANE, A VIEWPORT BREAKPOINT IS A LIE. A record built for a
    full-width panel and dropped into a narrow pane keeps every breakpoint
    answering yes — nothing on it is wrong, it is answering a question about the
    wrong box.
  */
  it("uses container queries for content and viewport queries only for the shell", () => {
    const media = [...STRUCTURE.matchAll(/@media \(min-width[^)]*\)\s*\{([^@]*)/g)].map((m) => m[1]!);
    expect(media.length).toBeGreaterThan(0);
    for (const block of media) {
      expect(block, "a viewport query may only shape the shell itself").toContain("[data-one='shell']");
    }
    expect(STRUCTURE).toContain("@container pane");
  });

  it("makes every pane a container, so what is inside can ask it", () => {
    expect(STRUCTURE).toMatch(/\[data-one='pane'\][^}]*container-type:\s*inline-size/);
  });

  /*
    ⚠️ A PALETTE DEFINED ONLY INSIDE A MEDIA QUERY HAS NO VALUE when the root
    carries an explicit choice — and the symptom is a page with no background at
    all on one setting. Both themes are always emitted, and the explicit one wins
    in either direction.
  */
  it("emits both themes, and lets an explicit choice win either way", () => {
    const sheet = themeSheet(DEFAULT_BRAND);
    expect(sheet).toMatch(/^:root \{/);
    expect(sheet).toContain("@media (prefers-color-scheme: dark)");
    expect(sheet).toContain(":root:not([data-theme='light'])");
    expect(sheet).toContain(":root[data-theme='dark']");
  });

  it("hides hover behind a fine pointer and gives a coarse one the roomy scale", () => {
    expect(STRUCTURE).toContain("@media (pointer: fine)");
    expect(STRUCTURE).toMatch(/@media \(pointer: coarse\)[^}]*--density: 1/);
    // A hover rule outside the guard would stick after a tap on a touch device.
    const hover = [...STRUCTURE.matchAll(/:hover/g)];
    const guarded = STRUCTURE.split("@media (pointer: fine)")[1] ?? "";
    expect(hover.length).toBe([...guarded.matchAll(/:hover/g)].length);
  });

  it("carries no colour of its own — every one is a token reference", () => {
    expect(STRUCTURE).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const value of STRUCTURE.matchAll(/(?:background|color)\s*:\s*([^;]+)/g)) {
      expect(value[1]!.trim(), value[0]).toMatch(/^(var\(--|currentColor)/);
    }
    // The whole sheet resolves: the brand half supplies what the structure names.
    const sheet = sheetFor(DEFAULT_BRAND);
    for (const token of [...STRUCTURE.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!)) {
      expect(sheet, token).toContain(`${token}:`);
    }
  });
});

/* ---------------------------------------------------------------- shell --- */

describe("the shell", () => {
  const shell = (width: Width, at = "notes", extra: Partial<Parameters<typeof Shell>[0]> = {}) =>
    html(<Shell destinations={destinations} at={at} width={width} detail={<span>record</span>} aside={<span>aside</span>} {...extra}>rows</Shell>);

  /*
    ⚠️ ONE NAVIGATION SURFACE. A rail AND a tab island is two answers to "where
    am I", and most "the desktop feels wrong" bugs are two levels of navigation
    wearing each other's clothes.
  */
  it("renders one navigation surface, placed by width", () => {
    for (const width of ["phone", "tablet", "desktop", "wide"] as Width[]) {
      const rendered = shell(width);
      expect([...rendered.matchAll(/data-one="nav"/g)]).toHaveLength(1);
      expect(rendered).toContain(width === "phone" ? 'data-placement="island"' : 'data-placement="rail"');
    }
  });

  it("keeps every destination's label with its icon", () => {
    const rendered = shell("desktop");
    for (const d of destinations) expect(rendered).toContain(`>${d.label}</span>`);
  });

  /*
    ⚠️ A COLLECTION SHOWS ITS LIST AND A RECORD AT ONCE from desktop up. Replacing
    the list on open is the single thing that makes a wide viewport read as a
    phone in the middle of a monitor.
  */
  it("shows the list and the record together, and only where there is room", () => {
    expect(shell("phone")).not.toContain('data-slot="detail"');
    expect(shell("tablet")).not.toContain('data-slot="detail"');
    expect(shell("desktop")).toContain('data-slot="detail"');
  });

  it("gives a task surface the whole width and no second navigation", () => {
    const player = shell("wide", "player");
    expect(player).toContain('data-shape="full-bleed"');
    expect(player).not.toContain('data-slot="detail"');
    expect([...player.matchAll(/data-one="nav"/g)]).toHaveLength(1);
  });
});

/* ----------------------------------------------------------------- live --- */

describe("a live surface is moved, never remounted", () => {
  const workout: LiveSurface = { id: "session", title: "Session", canDetach: true };
  const upload: LiveSurface = { id: "upload", title: "Upload", canDetach: false };
  const running = (): LiveState => {
    const r = live(IDLE, { kind: "claim", surface: workout });
    if (!r.ok) throw new Error("claim failed");
    return r.state;
  };

  /*
    ⚠️ AT MOST ONE. Two running timers is a product bug rather than a layout
    problem, so a second claim has to SAY it means to replace the first — which
    is a question worth putting to a person, not a default.
  */
  it("refuses a second live surface unless replacing is meant", () => {
    const state = running();
    const second = live(state, { kind: "claim", surface: upload });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.why).toContain("Session");
    expect(live(state, { kind: "claim", surface: upload, replace: true }).ok).toBe(true);
  });

  /*
    ⚠️ THE ASSERTION "MOVED, NEVER REMOUNTED" REDUCES TO. A presentation change
    that altered the instance would be a remount wearing a move's clothes — and
    the render loop, the media element and the elapsed timer would go with it.
  */
  it("keeps one instance across every presentation", () => {
    let state = running();
    const instance = state.instance;
    for (const presentation of ["dock", "pane", "detached", "full"] as const) {
      const moved = live(state, { kind: "present", presentation });
      expect(moved.ok, presentation).toBe(true);
      if (!moved.ok) return;
      state = moved.state;
      expect(state.instance, presentation).toBe(instance);
      expect(state.presentation).toBe(presentation);
    }
    expect(PRESENTATIONS).toHaveLength(4);
  });

  it("takes a new instance only when a different surface goes live", () => {
    const first = running();
    const same = live(first, { kind: "claim", surface: workout });
    expect(same.ok && same.state.instance).toBe(first.instance);
    const other = live(first, { kind: "claim", surface: upload, replace: true });
    expect(other.ok && other.state.instance).toBe(first.instance + 1);
  });

  /*
    ⚠️ DEGRADES TO ABSENCE, NEVER TO AN IMITATION. A lookalike window that
    behaves differently is worse than not offering one.
  */
  it("refuses to detach where the platform cannot", () => {
    const state = live(IDLE, { kind: "claim", surface: upload });
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(live(state.state, { kind: "present", presentation: "detached" }).ok).toBe(false);
  });

  it("says so before the tab closes when leaving would lose work", () => {
    expect(warnsBeforeLeaving(running())).toBe(false);
    const unsaved = live(IDLE, { kind: "claim", surface: { ...workout, unsaved: true } });
    expect(unsaved.ok && warnsBeforeLeaving(unsaved.state)).toBe(true);
  });

  /*
    ⚠️ THE DOCK IS THE SURFACE, SMALLER — never a notification about it. It is
    rendered ONCE whatever the presentation, because a branch per presentation is
    a remount: React tears down one position and builds the other.
  */
  it("hosts the subtree in one place, whatever the presentation", () => {
    const state = running();
    for (const presentation of PRESENTATIONS) {
      const moved = live(state, { kind: "present", presentation });
      if (!moved.ok) continue;
      const rendered = html(
        <Shell destinations={destinations} at="notes" width="desktop" liveState={moved.state} liveSurface={<span data-one="timer">00:42</span>}>
          rows
        </Shell>,
      );
      expect([...rendered.matchAll(/data-one="timer"/g)], presentation).toHaveLength(1);
      expect(rendered).toContain(`data-presentation="${presentation}"`);
    }
    expect(dockedTitle(state)).toBe("Session");
  });

  it("frees the slot on release", () => {
    const released = live(running(), { kind: "release" });
    expect(released.ok && released.state).toEqual(IDLE);
    expect(live(IDLE, { kind: "present", presentation: "dock" }).ok).toBe(false);
  });
});
