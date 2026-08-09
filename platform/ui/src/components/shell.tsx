/**
 * THE SHELL — one navigation surface, one shape, one live subtree.
 *
 * ⚠️ THE APP DOES NOT BUILD THIS AND CANNOT. Two things here are impossible
 * anywhere else: a transition where the same record is ONE element in both
 * places, and a live surface moved between presentations without unmounting.
 * Both need an owner of every surface at once, and there is exactly one.
 */

import type { ReactNode } from "react";
import type { Destination, Width } from "../registry.js";
import { shapeFor } from "../registry.js";
import type { LiveState, Presentation } from "../live.js";

export interface ShellProps {
  readonly destinations: readonly Destination[];
  readonly at: string;
  readonly width: Width;
  readonly children: ReactNode;
  /** The record beside the list, where the shape has two panes. */
  readonly detail?: ReactNode;
  readonly aside?: ReactNode;
  readonly liveState?: LiveState;
  readonly liveSurface?: ReactNode;
  readonly onGo?: (id: string) => void;
}

export function Shell({ destinations, at, width, children, detail, aside, liveState, liveSurface, onGo }: ShellProps) {
  const current = destinations.find((d) => d.id === at) ?? destinations[0];
  const shape = current ? shapeFor(current.kind, width) : "column";
  const presentation: Presentation | null = liveState?.surface ? liveState.presentation : null;

  return (
    <div data-one="shell" data-shape={shape} data-width={width}>
      {/*
        ⚠️ ONE NAVIGATION SURFACE. The rail and the tab island are the same list
        at two widths, never both at once — a rail AND a top nav bar is two
        answers to "where am I", and the top bar carries identity and this page's
        chrome, never destinations.
      */}
      <nav data-one="nav" data-placement={width === "phone" ? "island" : "rail"} aria-label="Sections">
        {destinations.map((d) => (
          <button
            key={d.id}
            type="button"
            data-one="nav-item"
            data-active={d.id === current?.id ? "" : undefined}
            aria-current={d.id === current?.id ? "page" : undefined}
            onClick={() => onGo?.(d.id)}
          >
            <span data-one="nav-icon" data-icon={d.icon} aria-hidden="true" />
            {/* ⚠️ The label travels with the icon. Icon-only is unnamed to voice control. */}
            <span data-one="nav-label">{d.label}</span>
          </button>
        ))}
      </nav>

      {/* ⚠️ Each pane is its own container, so what is inside asks IT and not the window. */}
      <main data-one="pane" data-slot="content">{children}</main>
      {shape === "two-pane" && detail ? <aside data-one="pane" data-slot="detail">{detail}</aside> : null}
      {shape === "board" && aside ? <aside data-one="pane" data-slot="aside">{aside}</aside> : null}

      {/*
        ⚠️ ONE HOST, RENDERED ONCE, WHATEVER THE PRESENTATION. Rendering the
        subtree in a branch per presentation is a REMOUNT — React tears down one
        position and builds the other — and the render loop, the media element
        and the elapsed timer go with it. The position is a data attribute; the
        element is the same element.
      */}
      {liveSurface ? (
        <div data-one="live" data-presentation={presentation ?? "none"} data-instance={liveState?.instance ?? 0}>
          {liveSurface}
        </div>
      ) : null}
    </div>
  );
}
