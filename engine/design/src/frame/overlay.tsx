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
            {children}
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
  };
  readonly cancel?: string;
}) {
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
            <Drawer.Footer>
              <Button slot="close" variant="tertiary">{cancel}</Button>
              <Button slot="close" variant={act.tone ?? "danger"} onPress={act.onDo}>
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
      <Dropdown.Popover>
        <Dropdown.Menu>
          {items.map((item) => (
            <Dropdown.Item
              key={item.id}
              id={item.id}
              textValue={item.label}
              isDisabled={item.disabled}
              onAction={item.onDo}
              className={item.tone === "danger" ? "text-danger" : undefined}
            >
              {item.icon}
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
    <Popover>
      <Popover.Trigger>{trigger}</Popover.Trigger>
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
 * The outcome of something the person just did, in one sentence.
 * `ok` confirms, `warn` qualifies, `fail` reports — and a failure that a
 * surface can show in place belongs there instead, as `Trouble`.
 */
export const notice = {
  ok: (says: string) => { Toast.toast.success(says); },
  warn: (says: string) => { Toast.toast.warning(says); },
  fail: (says: string) => { Toast.toast.danger(says); },
} as const;
