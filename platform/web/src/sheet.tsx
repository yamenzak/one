/**
 * THE SHEET — a surface that comes up from the bottom edge, and the two ways it
 * can be got rid of.
 *
 * ⚠️ DISMISSIBLE IS ONE PROPERTY, NOT THREE. Dragging it down, pressing outside it
 * and pressing Escape are the same statement — "I am leaving without deciding" —
 * so a sheet that allows one allows all three, and a sheet that allows none says
 * so with an × and refuses the other two. Wiring them separately produces the
 * sheet that cannot be dragged away but vanishes when a thumb brushes the ground
 * behind it, which is worse than either rule.
 *
 * ⚠️ THE GRABBER IS A CLAIM, SO IT ONLY APPEARS WHERE IT IS TRUE. A bar at the top
 * of a sheet is the one piece of furniture that means "pull me"; drawn on a sheet
 * that will not be pulled it is a control that does nothing, and drawn nowhere on
 * a sheet that will be, the gesture is undiscoverable.
 *
 * ⚠️ IT ANIMATES OUT AS WELL AS IN, and that is what the state attribute is for.
 * Radix keeps the node mounted until an animation on it finishes, so a surface
 * that arrived by rising does not have to leave by disappearing — which is the
 * single thing that most makes a presentation read as a screenshot being swapped.
 */

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Close } from "./icon.js";

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /**
   * ⚠️ FALSE MEANS THE PERSON HAS TO ANSWER. It replaces the grabber with an ×
   * and refuses the ground press and the Escape key — for the small number of
   * sheets where leaving without deciding is itself a decision somebody has to
   * make on purpose.
   */
  readonly dismissible: boolean;
  /** Named for a reader. The visible title is inside, and is its own element. */
  readonly label?: string;
  readonly children: ReactNode;
}

/** Past this many pixels, letting go closes it rather than settling back. */
const FAR_ENOUGH = 96;
/** Or this fast, in pixels per millisecond — a flick, from anywhere. */
const FAST_ENOUGH = 0.55;

export function Sheet({ open, onClose, dismissible, label, children }: SheetProps): ReactNode {
  const drag = useDragToClose(onClose);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        {/* ⚠️ THE SCREEN BEHIND STAYS VISIBLE, which is the whole difference between
            a sheet and the presentation it sits on. Editing one value is not
            leaving the screen the value is on, and dimming rather than covering is
            what says so. */}
        <Dialog.Overlay className="scrim" />
        <Dialog.Content
          className="sheet"
          ref={drag.ref}
          aria-label={label}
          aria-describedby={undefined}
          onPointerDown={releaseField}
          onPointerDownOutside={(e) => { if (!dismissible) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (!dismissible) e.preventDefault(); }}
          onOpenAutoFocus={(e) => {
            /* ⚠️ ON THE SURFACE, NOT ON ITS FIRST CONTROL — otherwise a sheet whose
               first control is the way out opens with a ring round it and reads
               "Close" before it reads its own title. A field inside asks for focus
               itself, which is a different decision made by whoever put it there. */
            if (!dismissible) { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus(); }
          }}
        >
          {dismissible ? (
            <div className="grabber" onPointerDown={drag.begin} onPointerMove={drag.move}
              onPointerUp={drag.end} onPointerCancel={drag.end}>
              <span className="grabber-bar" aria-hidden="true" />
            </div>
          ) : (
            <button type="button" className="sheet-close press" aria-label="Close" onClick={onClose}>
              <Close size={18} />
            </button>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * ⚠️ PRESSING THE SHEET ITSELF GIVES UP THE FIELD, and it is the only way out of a
 * state nothing reports. Dismissing a soft keyboard does not blur the input that
 * summoned it — no event fires, no viewport changes, nothing resizes — so where
 * the keyboard cannot be measured (a page inside a frame), a sheet that moved out
 * of its way has no way of learning that it may come back. Pressing anything that
 * is not a control is the gesture people already make to put a keyboard away, and
 * here it does exactly that.
 */
const releaseField = (e: ReactPointerEvent): void => {
  if ((e.target as HTMLElement).closest("input, textarea, select, button, a")) return;
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused.matches("input, textarea")) focused.blur();
};

/**
 * ⚠️ IT WRITES A CUSTOM PROPERTY RATHER THAN REACT STATE. A drag is a frame-rate
 * event; routing every pointer move through a render is how a sheet that should
 * stick to the thumb ends up trailing it. The property composes with the
 * keyboard's in one declaration, so the two corrections cannot fight.
 */
function useDragToClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const from = useRef<{ y: number; at: number } | null>(null);

  const begin = useCallback((e: ReactPointerEvent) => {
    /* ⚠️ NOT ON A WIDE WINDOW. There the sheet is centred rather than attached to
       an edge, so there is no direction that means "away" — and a pointer is a
       mouse, which does not drag things it did not pick up. */
    if (!ref.current || window.matchMedia("(min-width: 640px)").matches) return;
    from.current = { y: e.clientY, at: e.timeStamp };
    ref.current.dataset.dragging = "";
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const move = useCallback((e: ReactPointerEvent) => {
    if (!from.current || !ref.current) return;
    /* Downwards only. Pulling up on a sheet already at the bottom stretches it,
       which reads as the sheet coming apart. */
    const by = Math.max(0, e.clientY - from.current.y);
    ref.current.style.setProperty("--drag", `${by}px`);
  }, []);

  const end = useCallback((e: ReactPointerEvent) => {
    const started = from.current;
    const node = ref.current;
    from.current = null;
    if (!started || !node) return;
    delete node.dataset.dragging;
    const by = Math.max(0, e.clientY - started.y);
    const speed = by / Math.max(1, e.timeStamp - started.at);
    node.style.removeProperty("--drag");
    if (by > FAR_ENOUGH || (by > 24 && speed > FAST_ENOUGH)) onClose();
  }, [onClose]);

  return { ref, begin, move, end };
}
