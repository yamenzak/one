/**
 * WHAT INTERRUPTS THE SCREEN, AND ON WHAT TERMS.
 *
 * ⚠️ FOUR SHAPES, CHOSEN BY WHAT THE MOMENT IS — never by taste:
 *
 *   Tray     slides up from the edge. For a TASK inside a screen — pick, edit,
 *            share — where the screen behind is still the subject.
 *   Dialog   holds the middle. For a MOMENT of its own — a form, a result —
 *            where the screen behind stops mattering until this is done.
 *   Confirm  a question with two buttons, on a sheet like everything else. For
 *            an action that cannot be taken back; the destructive wording is on
 *            the button, not the title. It is a `Drawer` carrying
 *            `role="alertdialog"` — the presentation the rest of the product
 *            uses, with the announcement a warning needs.
 *   Menu     actions behind an ellipsis. For the second tier — everything a
 *            row can do that did not earn a place on its face.
 *
 * ⚠️ EVERY OVERLAY IS TRIGGER-COMPOSED. The trigger lives inside the overlay
 * component, which is what makes focus return to it on close — pass the button
 * as `trigger` rather than wiring `isOpen` by hand, and the whole ceremony
 * (focus trap, escape, backdrop, restore) is the library's problem.
 *
 * ⚠️ A NOTICE IS AN OUTCOME, NOT A PLACE. `notice.ok/warn/fail` for the result
 * of something the person just did; never for ambient state (that is the
 * inbox) and never for a refusal a surface can show in place (that is
 * `Trouble`). `NoticeHost` mounts once, in the shell.
 */

import * as React from "react";
import { Button, Drawer, Dropdown, Label, Modal, Popover, Toast } from "@heroui/react";
import { sayGate, useGate } from "../parts/gated.js";
import { ICON, PRESENTED_PAD } from "../tokens/metrics.js";

/* ------------------------------------------------------------------- tray --- */

export function Tray({ trigger, title, children, actions, isOpen, onOpenChange }: {
  /**
   * ⚠️ OPTIONAL, BECAUSE THE THING THAT OPENS A TRAY IS OFTEN A WHOLE ROW. A
   * trigger has to be a single pressable element, so a list whose subject is a
   * person could only offer a "Manage" button in the corner — leaving the row
   * itself inert next to a chevron-less control, which is the opposite of what
   * a roster should feel like. Controlled, the LIST opens the tray and the tray
   * needs no trigger of its own (DESIGN.md §5).
   */
  readonly trigger?: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  /*
    ⚠️ A TRAY IS THE SHAPE FOR A QUESTION THE SIZE OF WHAT IT ASKS, and there is
    no prop that makes it right for a long one. The library's bottom drawer is
    `max-h-[85vh]` with AUTO height, so a form resizes under the reader's thumb
    as fields appear and crosses the ceiling and back as they scroll; its
    container tracks the VISUAL viewport, so on a phone it also moves when the
    URL bar collapses. A fixed height was tried and it only made the symptom
    smaller — the shape was wrong. **A form that scrolls is a page** (DESIGN.md
    §5), and the one that proved it now has an address of its own.
  */
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <Drawer.Backdrop>
        <Drawer.Content>
          <Drawer.Dialog>
            <Drawer.Handle />
            <Drawer.Header>
              <Drawer.Heading>{title}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>{children}</Drawer.Body>
            {actions ? <Drawer.Footer>{actions}</Drawer.Footer> : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

/* ----------------------------------------------------------------- dialog --- */

export function Dialog({ trigger, title, children, actions }: {
  readonly trigger: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly actions?: React.ReactNode;
}) {
  return (
    <Modal>
      {trigger}
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
            {actions ? <Modal.Footer>{actions}</Modal.Footer> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ------------------------------------------------------------------- over --- */

/**
 * A SURFACE PRESENTED OVER WHATEVER SOMEBODY WAS DOING.
 *
 * ⚠️ IT IS A ROUTE, NOT A POPUP, AND IT NEVER OWNS `open`. A person can link to
 * it, land on it and reload it — so which surface is showing is the address's
 * business, and a component holding that state is a surface nobody can send
 * anybody to.
 *
 * ⚠️ AND IT COVERS THE VIEWPORT RATHER THAN DIMMING IT. A dimmed layer under an
 * opaque one is a gradient nobody asked for, visible as a seam either side of a
 * capped column; what is underneath is not context here, it is where somebody
 * came from and where dismissing returns them.
 *
 * ⚠️ IT DECLARES THAT IT SCROLLS. A screen's crown reads the nearest scrolling
 * ancestor to collapse its title, so a presented surface that did not say so
 * would leave every title inside it frozen at full size.
 *
 * ⚠️ AND `scroll="inside"` PUTS THE SCROLLING ON `Modal.Body`, NOT ON THE
 * DIALOG. The dialog it gives `overflow-clip` and a height capped at the
 * viewport; `.modal__body--scroll-inside` is the only part that gets
 * `overflow-y: auto`. Rendered straight into the dialog with no body, the
 * content past the fold was CLIPPED and nothing scrolled — a workspace with six
 * rows showed four and a half, with the last one fading under a hard edge, and
 * the docked action sat over content nobody could reach. A `data-scroll`
 * attribute was there instead, read by nothing.
 *
 * ⚠️ AND THE BODY'S OWN TYPE IS ANSWERED BY `Page`, NOT OVERRIDDEN HERE. A modal
 * body is `text-sm text-muted` because it is usually a paragraph under a heading;
 * what goes in here is a whole page, and inheriting muted 14px would repaint
 * every unstyled word in the account centre. Reaching in with a `className` to
 * repaint it is a restyle and D7 refuses it — correctly, because the fix belongs
 * one level down: a page states its own size, measure and INK rather than taking
 * whatever contains it. What this slot does declare is the one thing a page
 * cannot answer from inside — the container's own inset, as `PRESENTED_PAD`.
 */
export function Over({ open, onClose, label, children }: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** What this surface IS, for a reader — the visible title is inside it. */
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    /* ⚠️ `full` AND `opaque` ARE THE LIBRARY'S OWN, not a className fight. HeroUI
       ships a full-viewport size and an opaque backdrop; forcing an ordinary
       modal into the same shape with `rounded-none border-0 p-0` is the restyle
       D7 refuses, and it comes apart on the first library update. */
    <Modal isOpen={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* ⚠️ `opaque` and `full` are the library's own variants — see above. Each
          part takes the one that is its own business: the backdrop decides how
          it covers, the container decides the size and who scrolls. */}
      <Modal.Backdrop variant="opaque">
        <Modal.Container size="full" scroll="inside">
          {/* ⚠️ No `Modal.CloseTrigger` — the way out is the screen's own crown,
              which is where somebody looks for it and which knows whether this
              is a dismiss or a step back. Two ways out is one too many. */}
          <Modal.Dialog aria-label={label} data-scroll="true">
            {/* ⚠️ THE PART THAT SCROLLS, AND ITS BLOCK INSET IS TURNED OFF —
                a container presenting a whole page owes it no density of its
                own. Which axis, and why only that one, is `PRESENTED_PAD`. */}
            <Modal.Body className={PRESENTED_PAD}>{children}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/* ---------------------------------------------------------------- confirm --- */

/**
 * ⚠️ THE BUTTON SAYS WHAT IT DOES — "Delete workspace", never "Yes". A person
 * under a modal reads the buttons first; "Yes / No" makes them re-read the
 * question, and a mis-click on this particular dialog is the one that cannot
 * be taken back.
 */
export function Confirm({ trigger, title, children, act, cancel = "Cancel" }: {
  readonly trigger: React.ReactNode;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly act: {
    readonly label: string;
    readonly onDo: () => void;
    /** `danger` for the irreversible; default for the merely consequential. */
    readonly tone?: "danger" | "primary";
    /**
     * ⚠️ WHAT IT CALLS, AND THIS IS THE CONTROL THAT MOST NEEDS IT. A
     * confirmation is the one a person has already decided on: reading the
     * question, meaning it, pressing through — and then being told the plan does
     * not include it. Naming the operation lets the gate answer before the
     * question is even asked (`useGate`).
     */
    readonly op?: string;
  };
  readonly cancel?: string;
}) {
  const stopped = useGate(act.op);
  return (
    /*
      ⚠️ A SHEET, LIKE EVERY OTHER INTERRUPTION IN THIS PRODUCT. It was an
      `AlertDialog` — a box in the middle of the screen — while `Tray` slid up
      from the edge, so the one moment a person has to read carefully was the one
      moment the product moved differently. On a phone that is the difference
      between a control under the thumb and a control at the top of the reach.

      ⚠️ AND IT KEEPS `role="alertdialog"`, WHICH IS NOT COSMETIC. That role is
      what makes a screen reader announce the question rather than wait to be
      asked, and it is the reason `AlertDialog` existed here. Dropping it to gain
      the sheet would trade a real affordance for a visual one — react-aria's
      `Dialog` takes the role as a prop, so there is nothing to trade.
    */
    <Drawer>
      {trigger}
      <Drawer.Backdrop>
        <Drawer.Content>
          <Drawer.Dialog role="alertdialog">
            <Drawer.Handle />
            <Drawer.Header>
              <Drawer.Heading>{title}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>{children}</Drawer.Body>
            {/* ⚠️ THE WAY OUT FIRST AND THE ACT LAST, WHICH IS THE FOOTER'S OWN
                GRAMMAR. `Drawer.Footer` lays its actions in a row — measured,
                both buttons come back on one line — so this is the ordinary
                left-to-right reading where the destructive one is arrived at
                rather than landed on. A first draft stacked them and had to
                force the footer into a column, which is restyling a component
                behind the theme's back (D7) to solve a problem it does not
                have. */}
            {/* ⚠️ AND THE REASON SITS IN THE BODY RATHER THAN THE FOOTER. A
                footer lays its actions in a ROW, so a line of prose in it is a
                third column squeezed between two buttons. */}
            {stopped ? <Drawer.Body>{sayGate(stopped)}</Drawer.Body> : null}
            <Drawer.Footer>
              <Button slot="close" variant="tertiary">{cancel}</Button>
              <Button
                slot="close"
                variant={act.tone ?? "danger"}
                isDisabled={Boolean(stopped)}
                onPress={act.onDo}
              >
                {act.label}
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

/* ------------------------------------------------------------------- menu --- */

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  /**
   * ⚠️ THE MARK, AND IT IS WHAT MAKES A MENU SCANNABLE RATHER THAN READ. Five
   * items of two words each is five short lines a reader has to read all of to
   * find one; with marks the eye goes to the shape it remembers and the words
   * confirm it. A caller passes `glyphOf(…)` — the size and the ink are this
   * component's, so a menu cannot come out with four marks at four sizes.
   *
   * ⚠️ OPTIONAL, BUT ALL OR NOTHING PER MENU. One item with a mark and four
   * without indents the four by a mark's width against nothing, which reads as
   * the marked one being wrong rather than as the others being bare.
   */
  readonly icon?: React.ReactNode;
  readonly onDo: () => void;
  readonly disabled?: boolean;
  /** The destructive item sits last, and there is at most one. */
  readonly tone?: "danger";
}

export function Menu({ trigger, items }: {
  readonly trigger: React.ReactNode;
  readonly items: readonly MenuItem[];
}) {
  return (
    /*
      ⚠️ THE TRIGGER IS A DIRECT CHILD, NOT WRAPPED IN `Dropdown.Trigger`, and
      that is the library's own documented shape. `Dropdown.Trigger` renders a
      pressable of its own, so a `Button` inside it comes out as `<button>` in a
      `<button>` — invalid HTML, a React hydration error, and a control whose
      press target is ambiguous. Nothing about it is visible in a screenshot;
      it was found by reading the console on a rendered page.
    */
    <Dropdown>
      {trigger}
      {/*
        ⚠️ A FLOOR ON THE WIDTH, BECAUSE A MENU SIZES ITSELF TO ITS SHORTEST
        SENSIBLE WIDTH AND THAT IS THE WRONG TARGET. Left to shrink-to-fit, a
        menu of "Open", "Rename", "Remove" comes out about as wide as the word
        "Rename" — a column of three short lines hanging off a trigger, which is
        a shape a reader has to aim at rather than read. 224px is wide enough
        that the marks, the words and the destructive one at the bottom read as
        one list, and it is a floor rather than a width, so a longer label still
        sets the size.

        ⚠️ AND IT IS THE ONE PROPERTY BEING SET. `min-w-` is geometry, which is
        what a caller is allowed to state; the fill, the radius and the shadow
        stay the theme's, so a workspace's branding still reaches this surface
        (D7).
      */}
      <Dropdown.Popover className="min-w-56">
        <Dropdown.Menu>
          {items.map((item) => (
            <Dropdown.Item
              key={item.id}
              id={item.id}
              textValue={item.label}
              isDisabled={item.disabled}
              onAction={item.onDo}
              /* ⚠️ `data-ink`, NEVER `text-danger`. The attribute is the one
                 tone channel (`TONE_CSS`), and it carries the ink the contrast
                 reading tuned; the utility class is the library's raw fill
                 colour, which measured 3.39:1 in light and 3.65 in dark on the
                 surfaces this menu opens over. Two ways to say danger is two
                 different reds on one screen, and only one of them is legible. */
              {...(item.tone === "danger" ? { "data-ink": "danger" } : {})}
            >
              {/*
                ⚠️ THE MARK IS SIZED HERE AND INKED NOWHERE. `--icon` is the one
                channel that sets a glyph's size (`ambience.ts`), so every mark
                in every menu is `ICON.row` — the same 20px a list row's lead
                glyph draws at, which is what makes a menu look like it belongs
                to the row it opened from.

                ⚠️ AND IT INHERITS ITS COLOUR RATHER THAN TAKING A MUTED ONE.
                The item already carries `data-ink="danger"` where it applies,
                so an inherited mark goes red with its own label; a mark pinned
                to muted would leave the destructive item with a neutral glyph
                beside red words, which reads as two rows rather than one.
              */}
              {item.icon ? (
                <span
                  aria-hidden="true"
                  className="shrink-0"
                  style={{ ["--icon" as string]: `${ICON.row}px` }}
                >
                  {item.icon}
                </span>
              ) : null}
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/* ------------------------------------------------------------------- peek --- */

/** A small anchored card — a definition, a preview, a "what is this". */
export function Peek({ trigger, title, children }: {
  readonly trigger: React.ReactNode;
  readonly title?: string;
  readonly children: React.ReactNode;
}) {
  return (
    /*
      ⚠️ A DIRECT CHILD, NOT WRAPPED IN `Popover.Trigger` — the same rule `Menu`
      records one component up, and for a fault one degree worse than the nested
      `<button>` it avoids. `Popover.Trigger` renders a pressable of its own, so
      a `Button` inside it came out as a `div role="button" tabindex="0"` around
      a `button` — and react-aria gives BOTH the same `id`. Measured:
      two tab stops for one control, "button, button" to a screen reader, and a
      duplicate id under the popover's own `aria-*` wiring, which resolves by
      `getElementById` and therefore silently takes whichever came first.
      Nothing about any of it is visible in a screenshot.

      ⚠️ `Popover.Trigger` IS RIGHT FOR WHAT IT IS FOR, which is content that is
      not a control — the library's own example wraps an avatar and a name. A
      `Peek` hangs off something somebody presses, so it is never that case.
    */
    <Popover>
      {trigger}
      <Popover.Content>
        <Popover.Arrow />
        <Popover.Dialog>
          {title ? <Popover.Heading>{title}</Popover.Heading> : null}
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

/* ----------------------------------------------------------------- notice --- */

/**
 * ⚠️ MOUNTED ONCE, IN THE SHELL. Two hosts means every notice appears twice,
 * which reads as a fault in the thing being announced.
 */
export function NoticeHost() {
  return (
    <Toast.Provider placement="top">
      {/* The queue renders its toasts; nothing to declare here. */}
    </Toast.Provider>
  );
}

/**
 * ONE CONTROL A CONFIRMATION MAY CARRY — see `notice.ok`.
 *
 * ⚠️ ONE, AND ONLY ON A CONFIRMATION. A toast with two controls is a dialogue
 * somebody has to read, placed over the screen they were working on and
 * dismissed by a timer; a failure with a control is "retry", which is a
 * different feature with a different lifetime and belongs where the failure is.
 * What is left is the one shape that earns the room: something happened, and
 * here is the way back out of it.
 */
export interface Undo {
  /** A verb, in the words of what it does. */
  readonly says: string;
  readonly run: () => void;
}

/**
 * ⚠️ LONG ENOUGH TO NOTICE AND REACH, AND NO LONGER. The library's own timeout is
 * 4s, which is the right length for a sentence nobody has to act on and too
 * short for one they do: a way back that expires while somebody is still
 * deciding is worse than none, because they saw the offer and it was withdrawn.
 * Doubled to 8s — roughly the span of "wait, that was the wrong shelf" — and no
 * further, because a confirmation that outstays it sits over the next scan.
 *
 * ⚠️ IT IS ONLY SET WHERE THERE IS SOMETHING TO REACH FOR. An ordinary
 * confirmation keeps the library's 4s; widening every toast to make room for the
 * few that carry a control is how a product comes to feel slow.
 */
const REACHABLE_MS = 8_000;

/**
 * The outcome of something the person just did, in one sentence.
 * `ok` confirms, `warn` qualifies, `fail` reports — and a failure that a
 * surface can show in place belongs there instead, as `Trouble`.
 */
export const notice = {
  ok: (says: string, back?: Undo) => {
    Toast.toast.success(says, back
      ? { actionProps: { children: back.says, onPress: back.run }, timeout: REACHABLE_MS }
      : undefined);
  },
  warn: (says: string) => { Toast.toast.warning(says); },
  fail: (says: string) => { Toast.toast.danger(says); },
} as const;
