/**
 * LIVE SURFACES — a running thing that survives navigation.
 *
 * A workout mid-session, a channel preview, a cycle timer, an upload, a long
 * generation: surfaces that represent something ONGOING, where navigating away
 * today means losing it or hiding it.
 *
 * ⚠️ IT IS A PLATFORM PRIMITIVE FOR ONE TECHNICAL REASON: the tree must never be
 * unmounted between presentations. An app-level version re-renders and takes the
 * render loop, the camera stream, the media element and the elapsed timer with
 * it — so only whoever owns the shell can move a mounted subtree, and only the
 * shell knows about all four places it could go.
 */

/** The same instance, in four places. Never four components. */
export type Presentation = "full" | "dock" | "pane" | "detached";
export const PRESENTATIONS: readonly Presentation[] = ["full", "dock", "pane", "detached"];

export interface LiveSurface {
  readonly id: string;
  readonly title: string;
  /** An OS-level always-on-top window, where the platform offers one. */
  readonly canDetach: boolean;
  /** ⚠️ Whether leaving would lose work. Asked before the tab closes, not after. */
  readonly unsaved?: boolean;
}

export interface LiveState {
  readonly surface: LiveSurface | null;
  readonly presentation: Presentation;
  /**
   * ⚠️ THE INSTANCE, AND IT IS THE WHOLE POINT. It changes when a DIFFERENT
   * surface goes live and at no other time — so a presentation change that
   * altered it would be a remount wearing a move's clothes.
   */
  readonly instance: number;
}

export const IDLE: LiveState = { surface: null, presentation: "full", instance: 0 };

export type LiveEvent =
  | { readonly kind: "claim"; readonly surface: LiveSurface; readonly replace?: boolean }
  | { readonly kind: "present"; readonly presentation: Presentation }
  | { readonly kind: "release" };

export type LiveResult =
  | { readonly ok: true; readonly state: LiveState }
  | { readonly ok: false; readonly why: string; readonly state: LiveState };

/**
 * ⚠️ AT MOST ONE LIVE SURFACE. Two running timers is a product bug rather than a
 * layout problem, and a second claim therefore has to say it means to replace
 * the first — which is a question worth putting to a person, not a default.
 *
 * ⚠️ AND A PRESENTATION CHANGE NEVER TOUCHES THE INSTANCE. That single assertion
 * is what "moved, never remounted" reduces to in a form a test can hold.
 */
export function live(state: LiveState, event: LiveEvent): LiveResult {
  switch (event.kind) {
    case "claim": {
      if (state.surface && state.surface.id !== event.surface.id && !event.replace) {
        return { ok: false, why: `${state.surface.title} is already running`, state };
      }
      // The same surface claiming again is a no-op, not a remount.
      if (state.surface?.id === event.surface.id) return { ok: true, state };
      return { ok: true, state: { surface: event.surface, presentation: "full", instance: state.instance + 1 } };
    }
    case "present": {
      if (!state.surface) return { ok: false, why: "nothing is running", state };
      if (event.presentation === "detached" && !state.surface.canDetach) {
        /*
          ⚠️ DEGRADES TO ABSENCE, NEVER TO AN IMITATION. Where the platform has
          no always-on-top window, the control is not rendered — a lookalike that
          behaves differently is worse than not offering it.
        */
        return { ok: false, why: "this surface cannot be detached here", state };
      }
      return { ok: true, state: { ...state, presentation: event.presentation } };
    }
    case "release":
      return { ok: true, state: IDLE };
  }
}

/**
 * ⚠️ IT SURVIVES NAVIGATION AND NOT A RELOAD, and where unsaved work would be
 * lost it says so before the tab closes rather than after. A live surface that
 * silently discarded a half-finished session would be worse than one that never
 * survived navigation at all, because people would have started trusting it.
 */
export const warnsBeforeLeaving = (state: LiveState): boolean => Boolean(state.surface?.unsaved);

/** What the dock shows. ⚠️ The surface, smaller — never a notification about it. */
export const dockedTitle = (state: LiveState): string | null => state.surface?.title ?? null;
